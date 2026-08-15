import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEventDeviceReply,
  isEventDeviceQuestion,
} from "../src/lib/whatsapp/known-event-answers.ts";

test("duda de laptop/celular se resuelve con respuesta comercial", () => {
  assert.equal(
    isEventDeviceQuestion("¿Cada participante se lleva laptop para trabajar ahí?"),
    true,
  );
  assert.match(buildEventDeviceReply(), /celular/i);
  assert.match(buildEventDeviceReply(), /tu propia laptop/i);
  assert.doesNotMatch(buildEventDeviceReply(), /te entregamos una laptop/i);
});

test("una falla técnica no se disfraza de duda comercial", () => {
  assert.equal(isEventDeviceQuestion("mi laptop no funciona"), false);
  assert.equal(isEventDeviceQuestion("¿puedo usar mi celular?"), true);
});

