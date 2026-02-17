export const formatCurrency = (value: number | undefined) => {
    if (value === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
};

export const formatPercent = (value: number | undefined) => {
    if (value === undefined) return '0.00%';
    return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
};

export const formatPNL = (value: number | undefined) => {
    if (value === undefined) return '$0.00';
    const sign = value >= 0 ? '+' : '-';
    return `${sign}$${Math.abs(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
};

export const formatAmount = (value: number | undefined) => {
    if (value === undefined) return '0.0000';
    return value.toLocaleString(undefined, {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
    });
};
