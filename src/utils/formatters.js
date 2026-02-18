
/**
 * Formats a date string into a user-friendly long format.
 * @param {string} dateStr - ISO date string
 * @returns {string} - e.g. "Monday, January 1, 2026"
 */
export const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })
}

/**
 * Returns the display name for a member ID.
 * Returns 'You' for the current user, or the member's name from the list.
 * @param {string} id - The user ID to look up
 * @param {string} currentUserId - The logged-in user's ID
 * @param {Array} members - Array of member objects with { id, name }
 * @returns {string} - Display name
 */
export const getMemberName = (id, currentUserId, members) => {
    if (id === currentUserId) return 'You'
    const member = members.find(m => m.id === id)
    return member ? member.name : 'Unknown'
}
