/* eslint-disable import/no-unresolved */

import Plugin from 'src/script/helper/plugin/plugin.class';
import HttpClient from 'src/script/service/http-client.service';
import ElementLoadingIndicatorUtil from 'src/script/utility/loading-indicator/element-loading-indicator.util';
import FormSerializeUtil from 'src/script/utility/form/form-serialize.util';
import './swag-paypal.express-checkout.scss';

const OFF_CANVAS_CART_CLOSE_BUTTON_SELECTOR = '.btn.btn-light.btn-block.offcanvas-close.js-offcanvas-close.sticky-top';

export default class SwagPayPalExpressCheckoutButton extends Plugin {
    static options = {
        /**
         * This option specifies the PayPal button color
         */
        buttonColor: 'gold',

        /**
         * This option specifies the PayPal button shape
         */
        buttonShape: 'rect',

        /**
         * This option specifies the PayPal button size
         */
        buttonSize: 'small',

        /**
         * This option specifies the language of the PayPal button
         */
        languageIso: 'en_GB',

        /**
         * This option specifies if the PayPal button appears on the checkout/register page
         */
        loginEnabled: false,

        /**
         * This option toggles the SandboxMode
         */
        useSandbox: false,

        /**
         * This option holds the client id specified in the settings
         */
        clientId: '',

        /**
         * This option toggles the PayNow/Login text at PayPal
         */
        commit: false,

        /**
         * This option toggles the Text below the PayPal Express button
         */
        tagline: false,

        /**
         * The class that indicates if the script is loaded
         *
         * @type string
         */
        paypalScriptLoadedClass: 'paypal-checkout-js-loaded',

        /**
         * This option toggles the Process whether or not the product needs to be added to the cart.
         */
        addProductToCart: false
    };

    init() {
        this._client = new HttpClient(window.accessKey, window.contextToken);
        this.paypal = null;
        this.createButton();
    }

    createButton() {
        const paypalScriptLoaded = document.head.classList.contains(this.options.paypalScriptLoadedClass);

        if (paypalScriptLoaded) {
            this.paypal = window.paypal;
            this.renderButton();
            return;
        }

        this.createScript(() => {
            this.paypal = window.paypal;
            document.head.classList.add(this.options.paypalScriptLoadedClass);

            this.renderButton();
        });
    }

    createScript(callback) {
        const scriptOptions = this.getScriptUrlOptions();
        const payPalScriptUrl = this.options.useSandbox ? `https://www.paypal.com/sdk/js?client-id=sb${scriptOptions}` :
            `https://www.paypal.com/sdk/js?client-id=${this.options.clientId}${scriptOptions}`;
        const payPalScript = document.createElement('script');
        payPalScript.type = 'text/javascript';
        payPalScript.src = payPalScriptUrl;

        payPalScript.addEventListener('load', callback.bind(this), false);
        document.head.appendChild(payPalScript);

        return payPalScript;
    }

    renderButton() {
        return this.paypal.Buttons(this.getButtonConfig()).render(this.el);
    }

    getButtonConfig() {
        return {
            style: {
                size: this.options.buttonSize,
                shape: this.options.buttonShape,
                color: this.options.buttonColor,
                tagline: this.options.tagline,
                layout: 'horizontal',
                label: 'checkout',
                height: 40
            },

            /**
             * Will be called if the express button is clicked
             */
            createOrder: this.createOrder.bind(this),

            /**
             * Will be called if the payment process is approved by paypal
             */
            onApprove: this.onApprove.bind(this)
        };
    }

    /**
     * @return {Promise}
     */
    createOrder() {
        if (this.options.addProductToCart) {
            return this.addProductToCart().then(() => {
                return this._createOrder();
            });
        }

        return this._createOrder();
    }

    /**
     * @return {Promise}
     */
    _createOrder() {
        return new Promise(resolve => {
            this._client.get('/sales-channel-api/v1/_action/paypal/create-payment', responseText => {
                const response = JSON.parse(responseText);
                resolve(response.token);
            });
        });
    }

    addProductToCart() {
        const formattedLineItems = this._formatLineItems();

        return new Promise(resolve => {
            this._client.post('/checkout/line-item/add', JSON.stringify(formattedLineItems), () => {
                resolve();
            });
        });
    }

    /**
     * Returns the line item data with keys like: lineItems[06e28a73ecd44a0e84e5ddf144dff8d7][quantity],
     * as a proper Object.
     * @return {Object}
     */
    _formatLineItems() {
        const formData = FormSerializeUtil.serializeJson(this.el.parentElement);

        const formattedLineItems = {};
        Object.keys(formData).forEach(key => {
            const matches = key.match(/lineItems\[(.+)]\[(.+)]/);

            if (key !== 'redirectTo' && matches && matches.length === 3) {
                if (!formattedLineItems[matches[1]]) {
                    formattedLineItems[matches[1]] = {
                        [matches[2]]: formData[matches[0]]
                    };
                } else {
                    const lineItem = formattedLineItems[matches[1]];

                    lineItem[matches[2]] = formData[matches[0]];
                }
            }
        });

        return {
            lineItems: formattedLineItems
        };
    }

    /**
     * @param data
     */
    onApprove(data) {
        const offCanvasCloseButton = document.querySelector(OFF_CANVAS_CART_CLOSE_BUTTON_SELECTOR);
        const requestPayload = { paymentId: data.paymentID };

        // If the offCanvasCartCloseButton is visible, we close the offCanvsCart by clicking the element
        if (offCanvasCloseButton) {
            offCanvasCloseButton.click();
        }

        // Add a loading indicator to the body to prevent the user breaking the checkout process
        ElementLoadingIndicatorUtil.create(document.body);

        this._client.post(
            '/paypal/approve-payment',
            JSON.stringify(requestPayload),
            () => {
                window.location.replace('/checkout/confirm');
                ElementLoadingIndicatorUtil.remove(document.body);
            }
        );
    }

    /**
     * @return {string}
     */
    getScriptUrlOptions() {
        let config = '';
        config += `&locale=${this.options.languageIso}`;
        config += `&commit=${this.options.commit}`;
        config += '&disable-funding=card,credit,sepa';

        if (this.options.currency) {
            config += `&currency=${this.options.currency}`;
        }

        if (this.options.intent && this.options.intent !== 'sale') {
            config += `&intent=${this.options.intent}`;
        }

        return config;
    }
}