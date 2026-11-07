export function calculateComboDiscount(subtotalCents, itemCount, minimumItems = 2, percent = 5) {
  const subtotal = Number(subtotalCents);
  const count = Number(itemCount);
  const minimum = Number(minimumItems);
  const rate = Math.min(50, Math.max(0, Number(percent) || 0));
  if (!Number.isInteger(subtotal) || subtotal < 0 || !Number.isInteger(count) || count < 0)
    return 0;
  if (!Number.isInteger(minimum) || minimum < 2 || count < minimum || rate <= 0)
    return 0;
  return Math.floor(subtotal * rate / 100);
}
export function calculateLoyaltyPoints(productSubtotalCents) {
  const amount = Number(productSubtotalCents);
  if (!Number.isInteger(amount) || amount <= 0)
    return 0;
  return Math.floor(amount / 100);
}
