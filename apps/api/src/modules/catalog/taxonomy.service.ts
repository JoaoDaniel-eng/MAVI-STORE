import type { PoolClient } from "pg";
import { AppError } from "../../middleware/errors";
import type { Def, Row } from "./crud";

export const categories: Def = { table: "categories", entity: "category", order: "sort_order, name" };
export const colors: Def = { table: "colors", entity: "color", order: "name" };
export const sizes: Def = { table: "sizes", entity: "size", order: "sort_order, label" };
export const sizeGuides: Def = { table: "size_guides", entity: "size_guide", order: "name" };

/** Categorias têm no máximo 2 níveis e não podem apontar para si mesmas. */
export const checkCategoryParent =
  (selfId: string | null, parentId: string | null | undefined) => async (c: PoolClient) => {
    if (!parentId) return;
    if (parentId === selfId) throw new AppError(400, "invalid_parent", "Uma categoria não pode ser pai dela mesma.");
    const parent = (await c.query<Row>(`SELECT parent_id FROM categories WHERE id = $1`, [parentId])).rows[0];
    if (!parent) throw new AppError(400, "invalid_parent", "Categoria pai não encontrada.");
    if (parent["parent_id"]) throw new AppError(400, "invalid_parent", "Use no máximo 2 níveis de categoria.");
    if (selfId) {
      const kids = await c.query(`SELECT 1 FROM categories WHERE parent_id = $1 LIMIT 1`, [selfId]);
      if (kids.rowCount) throw new AppError(400, "invalid_parent", "Categoria com subcategorias não pode ter pai.");
    }
  };
