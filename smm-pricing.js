export function calculateSmmPrice(quantity, baseQuantity, basePriceUzs) {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    !Number.isSafeInteger(baseQuantity) ||
    baseQuantity <= 0 ||
    !Number.isSafeInteger(basePriceUzs) ||
    basePriceUzs <= 0
  ) {
    return 0;
  }

  return Math.ceil((basePriceUzs * quantity) / baseQuantity);
}
