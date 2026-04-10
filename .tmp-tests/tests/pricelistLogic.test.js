"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const pricelistLogic_1 = require("../src/services/pricelistLogic");
function testBuildPartnerPricelistCandidates() {
    strict_1.default.deepEqual((0, pricelistLogic_1.buildPartnerPricelistCandidates)({
        id: 25,
        parent_id: [9, 'Cliente Matriz'],
        commercial_partner_id: [9, 'Cliente Matriz'],
    }), [25, 9], 'debe intentar primero el contacto y después el partner comercial');
    strict_1.default.deepEqual((0, pricelistLogic_1.buildPartnerPricelistCandidates)({
        id: 25,
        parent_id: [24, 'Sucursal'],
        commercial_partner_id: [9, 'Cliente Matriz'],
    }), [25, 24, 9], 'debe conservar la cadena sin duplicados');
}
function testFormulaPriceComputation() {
    const product = { id: 10, list_price: 100 };
    const price = (0, pricelistLogic_1.computeRulePrice)(product, {
        compute_price: 'formula',
        base: 'list_price',
        price_discount: -10,
        price_surcharge: 5,
        price_round: 10,
        price_min_margin: 0,
        price_max_margin: 0,
    });
    strict_1.default.equal(price, 115, 'la formula debe soportar descuento/margen, recargo y redondeo');
}
function testFormulaMargins() {
    const product = { id: 10, list_price: 100 };
    const minMarginPrice = (0, pricelistLogic_1.computeRulePrice)(product, {
        compute_price: 'formula',
        base: 'list_price',
        price_discount: 20,
        price_surcharge: 0,
        price_round: 0,
        price_min_margin: 15,
        price_max_margin: 0,
    });
    strict_1.default.equal(minMarginPrice, 115, 'debe respetar margen minimo');
    const maxMarginPrice = (0, pricelistLogic_1.computeRulePrice)(product, {
        compute_price: 'formula',
        base: 'list_price',
        price_discount: -50,
        price_surcharge: 0,
        price_round: 0,
        price_min_margin: 0,
        price_max_margin: 20,
    });
    strict_1.default.equal(maxMarginPrice, 120, 'debe respetar margen maximo');
}
function testRoundToPricelistStep() {
    strict_1.default.equal((0, pricelistLogic_1.roundToPricelistStep)(101.2, 10), 110);
    strict_1.default.equal((0, pricelistLogic_1.roundToPricelistStep)(101.2, 0.05), 101.2);
    strict_1.default.equal((0, pricelistLogic_1.roundToPricelistStep)(101.23, 0.05), 101.25);
}
function testPreferredPartnerPricelistIdPriority() {
    strict_1.default.equal((0, pricelistLogic_1.getPreferredPartnerPricelistId)({
        pricelist_id: [93, 'IGUALA MEZCALA (MXN)'],
        specific_property_product_pricelist: [12, 'Especial'],
        property_product_pricelist: [1, 'Predeterminado (MXN)'],
    }), 93, 'debe priorizar pricelist_id cuando existe');
    strict_1.default.equal((0, pricelistLogic_1.getPreferredPartnerPricelistId)({
        pricelist_id: false,
        specific_property_product_pricelist: [12, 'Especial'],
        property_product_pricelist: [1, 'Predeterminado (MXN)'],
    }), 12, 'debe caer a specific_property_product_pricelist si no hay pricelist_id');
    strict_1.default.equal((0, pricelistLogic_1.getPreferredPartnerPricelistId)({
        pricelist_id: false,
        specific_property_product_pricelist: false,
        property_product_pricelist: [1, 'Predeterminado (MXN)'],
    }), 1, 'debe usar property_product_pricelist como ultimo recurso');
}
function main() {
    testBuildPartnerPricelistCandidates();
    testFormulaPriceComputation();
    testFormulaMargins();
    testRoundToPricelistStep();
    testPreferredPartnerPricelistIdPriority();
    console.log('pricelist logic tests: ok');
}
main();
