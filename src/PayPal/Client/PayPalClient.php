<?php declare(strict_types=1);
/*
 * (c) shopware AG <info@shopware.com>
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Swag\PayPal\PayPal\Client;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Monolog\Logger;
use Swag\PayPal\Payment\Exception\PayPalApiException;
use Swag\PayPal\PayPal\Api\Common\PayPalStruct;
use Swag\PayPal\PayPal\Api\OAuthCredentials;
use Swag\PayPal\PayPal\BaseURL;
use Swag\PayPal\PayPal\PartnerAttributionId;
use Swag\PayPal\PayPal\Resource\TokenResource;
use Swag\PayPal\Setting\Exception\PayPalSettingsInvalidException;
use Swag\PayPal\Setting\SwagPayPalSettingStruct;

class PayPalClient
{
    /**
     * @var TokenResource
     */
    private $tokenResource;

    /**
     * @var Client
     */
    private $client;

    /**
     * @var Logger
     */
    private $logger;

    /**
     * @throws PayPalSettingsInvalidException
     */
    public function __construct(
        TokenResource $tokenResource,
        SwagPayPalSettingStruct $settings,
        Logger $logger,
        string $partnerAttributionId = PartnerAttributionId::PAYPAL_CLASSIC
    ) {
        $this->tokenResource = $tokenResource;
        $this->logger = $logger;

        $url = $settings->getSandbox() ? BaseURL::SANDBOX : BaseURL::LIVE;

        $clientId = $settings->getClientId();
        $clientSecret = $settings->getClientSecret();

        if ($clientId === '') {
            throw new PayPalSettingsInvalidException('clientId');
        }

        if ($clientSecret === '') {
            throw new PayPalSettingsInvalidException('clientSecret');
        }

        $credentials = $this->createCredentialsObject($clientId, $clientSecret);
        $authorizationHeader = $this->createAuthorizationHeaderValue($credentials, $url);

        $this->client = new Client([
            'base_uri' => $url,
            'headers' => [
                'PayPal-Partner-Attribution-Id' => $partnerAttributionId,
                'Authorization' => $authorizationHeader,
            ],
        ]);
    }

    /**
     * @throws RequestException
     */
    public function sendPostRequest(string $resourceUri, PayPalStruct $data): array
    {
        $options = [
            'headers' => ['content-type' => 'application/json'],
            'json' => $data,
        ];
        try {
            $response = $this->client->post($resourceUri, $options)->getBody()->getContents();
        } catch (RequestException $requestException) {
            $this->handleRequestException($requestException, $data);

            throw $requestException;
        }

        return $this->decodeJsonResponse($response);
    }

    /**
     * @throws RequestException
     */
    public function sendGetRequest(string $resourceUri): array
    {
        try {
            $response = $this->client->get($resourceUri)->getBody()->getContents();
        } catch (RequestException $requestException) {
            $this->handleRequestException($requestException, null);

            throw $requestException;
        }

        return $this->decodeJsonResponse($response);
    }

    /**
     * @param PayPalStruct[] $data
     *
     * @throws RequestException
     */
    public function sendPatchRequest(string $resourceUri, array $data): array
    {
        $options = [
            'headers' => ['content-type' => 'application/json'],
            'json' => $data,
        ];
        try {
            $response = $this->client->patch($resourceUri, $options)->getBody()->getContents();
        } catch (RequestException $requestException) {
            $this->handleRequestException($requestException, $data);

            throw $requestException;
        }

        return $this->decodeJsonResponse($response);
    }

    private function createCredentialsObject(string $clientId, string $clientSecret): OAuthCredentials
    {
        $credentials = new OAuthCredentials();
        $credentials->setRestId($clientId);
        $credentials->setRestSecret($clientSecret);

        return $credentials;
    }

    private function createAuthorizationHeaderValue(OAuthCredentials $credentials, string $url): string
    {
        $token = $this->tokenResource->getToken($credentials, $url);

        return $token->getTokenType() . ' ' . $token->getAccessToken();
    }

    private function decodeJsonResponse(string $response): array
    {
        return json_decode($response, true);
    }

    /**
     * @param PayPalStruct|PayPalStruct[]|null $data
     *
     * @throws PayPalApiException
     */
    private function handleRequestException(RequestException $requestException, $data): void
    {
        $exceptionMessage = $requestException->getMessage();
        $exceptionResponse = $requestException->getResponse();

        if ($exceptionResponse === null) {
            $this->logger->error($exceptionMessage, [$data]);

            return;
        }

        $error = json_decode($exceptionResponse->getBody()->getContents(), true);
        $message = $error['message'];

        if (isset($error['details'])) {
            $message .= ': ';
            foreach ($error['details'] as $detail) {
                $message .= $detail['issue'] . ' (' . $detail['field'] . ') ';
            }
        }

        $this->logger->error($exceptionMessage . ' ' . $message, [$error, $data]);

        throw new PayPalApiException($error['name'], $message);
    }
}
