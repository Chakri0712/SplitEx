
/**
 * Returns the display symbol for a given currency code.
 * @param {string} currencyCode - e.g. 'USD', 'INR', 'EUR'
 * @returns {string} - Currency symbol like '$', '₹', '€'
 */
export const getCurrencySymbol = (currencyCode) => {
    switch (currencyCode) {
        case 'USD':
        case 'CAD':
            return '$'
        case 'EUR':
            return '€'
        case 'INR':
            return '₹'
        case 'GBP':
            return '£'
        case 'JPY':
            return '¥'
        case 'AUD':
            return 'A$'
        default:
            return currencyCode
    }
}
