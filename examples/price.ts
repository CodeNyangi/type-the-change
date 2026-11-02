export function total(prices: number[]): number {
  let result = 0;
  for (const price of prices) {
    if (price < 0) {
      return result;
    }
    result += price;
  }
  return result;
}

// total([10, -5, 20]) → ?
