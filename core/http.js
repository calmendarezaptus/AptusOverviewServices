// Contrato de error común a todas las funciones: { error, stage, outcome_unknown }.
// Los 500 nunca exponen el mensaje interno; los 4xx/502/503 llevan un mensaje pensado para el usuario.
export function sendError(res, error, internalMessage) {
    const status = error.status || 500;
    const details = { stage: error.stage ?? 'validation', outcome_unknown: error.outcome_unknown ?? false };
    if (status >= 500) console.error(internalMessage, { ...details, provider_status: error.provider_status ?? null });
    return res.status(status).json({ error: status === 500 ? internalMessage : error.message, ...details });
}

export function isValidOrganizationId(value) {
    return typeof value === 'string' && /^\d{1,20}$/.test(value);
}
