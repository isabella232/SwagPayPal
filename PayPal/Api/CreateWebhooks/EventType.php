<?php declare(strict_types=1);
/**
 * (c) shopware AG <info@shopware.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace SwagPayPal\PayPal\Api\CreateWebhooks;

use SwagPayPal\PayPal\Api\Common\PayPalStruct;

class EventType extends PayPalStruct
{
    /**
     * @var string
     */
    protected $name;

    protected function setName(string $name): void
    {
        $this->name = $name;
    }
}
