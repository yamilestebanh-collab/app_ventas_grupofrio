"use strict";
/**
 * Odoo JSON-RPC wrapper.
 * From KOLD_FIELD_SPEC.md section 5 — generic endpoints.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.odooRead = odooRead;
exports.odooWrite = odooWrite;
exports.odooRpc = odooRpc;
exports.koldRead = koldRead;
const api_1 = require("./api");
/**
 * Read records from Odoo via get_records endpoint.
 */
async function odooRead(model, domain = [], fields = [], limit = 100, offset = 0, order) {
    try {
        // BLD-20260404-007: Backend may return either a plain array or
        // a wrapped object { status, count, response: [...], message }.
        const result = await (0, api_1.postRpc)('/get_records', { model, domain, fields, limit, offset, order });
        if (Array.isArray(result))
            return result;
        if (result && Array.isArray(result.response))
            return result.response;
        return [];
    }
    catch (error) {
        console.warn(`[odooRead] ${model} failed:`, error);
        return [];
    }
}
/**
 * Create or update record in Odoo.
 */
async function odooWrite(model, method, dict) {
    const result = await (0, api_1.postRpc)('/api/create_update', { model, method, dict });
    return result;
}
/**
 * Direct JSON-RPC call to Odoo.
 */
async function odooRpc(model, method, args = [], kwargs = {}) {
    return await (0, api_1.postJsonRpc)('/jsonrpc', { model, method, args, kwargs });
}
/**
 * Defensively try to read from a KOLD OS module.
 * Returns null if the module is not installed.
 */
async function koldRead(model, domain = [], fields = [], limit = 100) {
    try {
        return await odooRead(model, domain, fields, limit);
    }
    catch {
        // Module not installed or model doesn't exist
        return null;
    }
}
