import bcrypt from "bcryptjs";

const COST = 12;
// Hash fixo usado quando o e-mail não existe, para o tempo de resposta não revelar contas.
const DUMMY_HASH = bcrypt.hashSync("senha-ficticia-para-tempo-constante", COST);

export const hashPassword = (password: string) => bcrypt.hash(password, COST);

export async function verifyPassword(password: string, hash: string | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== undefined && ok;
}
