import './FilterSelect.css'

export default function FilterSelect({ label, value, onChange, options }) {
    return (
        <div className="filter-select">
            <span className="filter-select-label">{label}</span>
            <div className="filter-select-value-row">
                <span className="filter-select-value">
                    {options.find(o => o.value === value)?.label ?? value}
                </span>
                <svg className="filter-select-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </div>
            <select
                className="filter-select-native"
                value={value}
                onChange={onChange}
                aria-label={label}
            >
                {options.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
        </div>
    )
}
