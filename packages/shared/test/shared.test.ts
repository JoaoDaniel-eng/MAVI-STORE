import assert from "node:assert/strict";
import { test } from "node:test";
import { hasPermission, isValidCpf, PERMISSIONS, permissionsOf } from "../src/index";

test("CPF: valida dígitos verificadores", () => {
  for (const ok of ["529.982.247-25", "52998224725", "111.444.777-35", "123.456.789-09"]) assert.equal(isValidCpf(ok), true, ok);
  for (const bad of ["123.456.789-10", "111.111.111-11", "000.000.000-00", "5299822472", ""]) assert.equal(isValidCpf(bad), false, bad);
});

test("Permissões: matriz por perfil", () => {
  assert.ok(PERMISSIONS.every((p) => hasPermission("owner", p)), "Proprietária tem tudo");
  for (const p of ["users.read", "dashboard.read", "orders.cancel", "settings.read"] as const) assert.equal(hasPermission("staff", p), false, `Funcionário sem ${p}`);
  assert.ok(hasPermission("staff", "orders.manage") && hasPermission("staff", "stock.move"));
  assert.equal(hasPermission("staff", "stock.adjust"), false);
  for (const p of ["privacy.manage", "settings.manage", "users.manage_managers"] as const) assert.equal(hasPermission("manager", p), false, `Gerente sem ${p}`);
  assert.equal(permissionsOf("customer").length, 0);
});
