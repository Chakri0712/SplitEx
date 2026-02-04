
/**
 * Validates a name/text field.
 * - Trims whitespace.
 * - Checks for empty values.
 * - Checks length limit.
 * - Ensures at least one alphanumeric character (prevents only special chars).
 * @param {string} text - The input text.
 * @param {string} label - The label for the error message.
 * @param {number} maxLength - Maximum character length (default 50).
 * @returns {string|null} - Error message or null if valid.
 */
export const validateName = (text, label = "Name", maxLength = 50) => {
    if (!text) return `${label} is required.`

    const trimmed = text.trim()
    if (!trimmed) return `${label} cannot be empty.`

    if (trimmed.length > maxLength) return `${label} cannot exceed ${maxLength} characters.`

    // Check for at least one alphanumeric character to prevent "!!!" or "..." names
    // \p{L} matches any unicode letter, \p{N} any number. 
    // Fallback to [a-zA-Z0-9] if broad unicode support isn't critical or strict ASCII desired.
    // Using simple regex for common alphabets and numbers.
    if (!/[a-zA-Z0-9]/.test(trimmed)) {
        return `${label} must contain at least one letter or number.`
    }

    return null
}

/**
 * Validates a currency amount.
 * - Must be a valid number > 0.
 * - Max value 1,000,000.
 * - Max 2 decimal places.
 * @param {string|number} amount - The amount to check.
 * @returns {string|null} - Error message or null if valid.
 */
export const validateAmount = (amount) => {
    if (amount === '' || amount === null || amount === undefined) return "Amount is required.";

    const num = parseFloat(amount)
    if (isNaN(num)) return "Amount must be a number."
    if (num <= 0) return "Amount must be greater than 0."

    if (num > 1000000) return "Amount cannot exceed 1,000,000."

    // Check decimal places strictly via string regex
    // Allows integers (100) or floats with 1-2 decimals (10.5, 10.99)
    // Rejects 10.999
    if (!/^\d+(\.\d{1,2})?$/.test(amount.toString())) {
        return "Amount allows a maximum of 2 decimal places."
    }

    return null
}
