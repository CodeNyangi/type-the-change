export function total(prices) {
  let result = 0;
  for (const price of prices) {
    if (price < 0) {
      return result;
    }
    result += price;
  }
  return result;
}
