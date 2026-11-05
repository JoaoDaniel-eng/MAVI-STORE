import { useFavorites } from "../hooks/useFavorites";
import { HeartIcon } from "./Icons";

export function FavoriteButton({ productId, name, className = "" }: { productId: string; name: string; className?: string }) {
  const fav = useFavorites();
  const on = fav.has(productId);
  return (
    <button
      type="button"
      className={`fav ${on ? "is-on" : ""} ${className}`}
      aria-pressed={on}
      aria-label={on ? `Remover ${name} dos favoritos` : `Favoritar ${name}`}
      onClick={() => fav.toggle(productId)}
    >
      <HeartIcon filled={on} />
    </button>
  );
}
