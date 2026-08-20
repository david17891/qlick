import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSignatoriesForEvent,
  parseSignatoriesSnapshot,
} from "../src/lib/certificates/signatories.ts";

test("el evento CANACO usa las dos firmas transparentes en orden", () => {
  assert.deepEqual(getSignatoriesForEvent("desarrollo-estructura-curso-canaco"), [
    {
      name: "Paul Velásquez",
      title: "Ponente",
      assetFilename: "paul-event-signature.png",
    },
    {
      name: "Benny Zepeda",
      title: "Ponente",
      assetFilename: "benny-signature.png",
    },
  ]);
});

test("un evento anterior conserva la firma por defecto", () => {
  assert.deepEqual(getSignatoriesForEvent("marketing-ia-para-emprendedores-pago"), [
    {
      name: "Paul Velásquez",
      title: "Ponente",
      assetFilename: "paul-signature.png",
    },
  ]);
});

test("el snapshot de metadata solo acepta signatarios completos", () => {
  assert.equal(parseSignatoriesSnapshot([{ name: "Paul" }]), null);
  assert.deepEqual(parseSignatoriesSnapshot([
    { name: "Paul", title: "Ponente", assetFilename: "paul-event-signature.png" },
  ]), [
    { name: "Paul", title: "Ponente", assetFilename: "paul-event-signature.png" },
  ]);
});
