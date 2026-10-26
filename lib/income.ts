export const CRATE_KG = 20;

export interface IncomeInput {
  weight: number;
  price: number;
  days: number;
  coldRate?: number;
}

export function traditional({ weight, price }: IncomeInput) {
  const loss = weight * 0.38;
  const gross = (weight - loss) * price;
  const commission = gross * 0.12;
  const transport = weight * 3.5;
  const fees = weight * 1.058;
  const net = gross - commission - transport - fees;
  return { loss, gross, commission, transport, fees, net: Math.round(net) };
}

export function chillchain({ weight, price, days, coldRate = 18 }: IncomeInput) {
  const loss = weight * 0.08;
  const gross = (weight - loss) * price;
  const crates = Math.ceil(weight / CRATE_KG);
  const cold = crates * coldRate * days;
  const transport = weight * 2.2;
  const commission = gross * 0.08;
  const escrowFee = 104;
  const net = gross - cold - transport - commission - escrowFee;
  return { loss, gross, crates, cold, transport, commission, escrowFee, net: Math.round(net) };
}

export function compare(input: IncomeInput) {
  const a = traditional(input);
  const b = chillchain(input);
  const diff = b.net - a.net;
  const pct = a.net > 0 ? Math.round((diff / a.net) * 100) : 0;
  return { a, b, diff, pct };
}

export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
