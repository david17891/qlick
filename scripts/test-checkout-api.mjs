// Llama directo a la API de create-checkout de Qlick (test mode).
// Simula exactamente lo que hace el botón "Pagar entrada" del frontend.
const url = "https://www.qlick.digital/api/payments/create-checkout";
const body = JSON.stringify({
  slug: "marketing-ia-para-emprendedores-pago",
  productKind: "event",
  method: "card",
});

console.log(`POST ${url}`);
console.log(`body: ${body}`);

try {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    redirect: "follow",
  });
  console.log(`\nstatus: ${r.status} ${r.statusText}`);
  console.log(`headers: ${JSON.stringify(Object.fromEntries(r.headers), null, 2)}`);
  const text = await r.text();
  console.log(`\nbody: ${text.slice(0, 1500)}`);
} catch (e) {
  console.error("error:", e.message);
}
