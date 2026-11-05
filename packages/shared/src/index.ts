import { z } from "zod";
import { emailSchema, passwordSchema } from "./base";

export * from "./base";
export * from "./catalog";
export * from "./ops";
export * from "./admin9";
export * from "./checkout";
export * from "./settings";
export * from "./stock";
export * from "./store";

/** Perfis de acesso. "customer" é a cliente da loja; os demais são o painel. */
export const ROLES = ["owner", "manager", "staff", "customer"] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES = ["owner", "manager", "staff"] as const;

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Proprietária",
  manager: "Gerente",
  staff: "Funcionário",
  customer: "Cliente",
};

/** Integrações externas. Sem credencial no backend = "pendente". */
export const INTEGRATIONS = [
  "mercadopago",
  "asaas",
  "melhor_envio",
  "email",
  "storage",
] as const;
export type Integration = (typeof INTEGRATIONS)[number];
/** "credenciais_presentes" indica só que a variável existe; não prova que funciona. */
export type IntegrationStatus = "pendente" | "credenciais_presentes";


/* ---------- Fase 2: permissões, schemas e tipos de usuário ---------- */

export const PERMISSIONS = [
  "panel.access",
  "users.read",
  "users.manage_customers",
  "users.manage_staff",
  "users.manage_managers",
  "audit.read",
  "catalog.read",
  "catalog.manage",
  "stock.read",
  "stock.move",
  "stock.adjust",
  "settings.read",
  "settings.manage",
  "content.read",
  "content.manage",
  "coupons.read",
  "coupons.manage",
  "payments.read",
  "orders.read",
  "orders.manage",
  "orders.cancel",
  "reviews.moderate",
  "dashboard.read",
  "reports.read",
  "privacy.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Cada fase seguinte acrescenta as permissões dos seus módulos aqui.
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: ["panel.access", "users.read", "users.manage_customers", "users.manage_staff", "catalog.read", "catalog.manage",
    "stock.read", "stock.move", "stock.adjust", "settings.read", "content.read", "content.manage", "coupons.read", "coupons.manage", "payments.read",
    "orders.read", "orders.manage", "orders.cancel", "reviews.moderate", "dashboard.read", "reports.read"],
  staff: ["panel.access", "catalog.read", "stock.read", "stock.move", "orders.read", "orders.manage"],
  customer: [],
};

export const permissionsOf = (role: Role): readonly Permission[] => ROLE_PERMISSIONS[role];
export const hasPermission = (role: Role, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].includes(permission);

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
};

const nameSchema = z.string().trim().min(2).max(120);
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{10,20}$/, "Telefone inválido");

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "É preciso aceitar os termos." }) }),
  marketingOptIn: z.boolean().default(false),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export type LoginInput = z.infer<typeof loginSchema>;

export const STAFF_ASSIGNABLE_ROLES = ["manager", "staff"] as const;

export const createStaffSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(STAFF_ASSIGNABLE_ROLES),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    role: z.enum(STAFF_ASSIGNABLE_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nada para atualizar." });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

const pagination = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
};

export const listUsersQuerySchema = z.object({
  role: z.enum(ROLES).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  ...pagination,
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const auditQuerySchema = z.object({
  action: z.string().trim().max(100).optional(),
  entity: z.string().trim().max(100).optional(),
  actorId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  ...pagination,
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
