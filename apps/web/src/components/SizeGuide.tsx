import type { ProductDetail } from "@mavi/shared";
import { useRef } from "react";

export function SizeGuide({ guide }: { guide: NonNullable<ProductDetail["sizeGuide"]> }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="link-btn" onClick={() => ref.current?.showModal()}>Guia de medidas</button>
      <dialog ref={ref} className="dialog" onClick={(e) => e.target === ref.current && ref.current.close()}>
        <div className="dialog__head">
          <h2>{guide.name}</h2>
          <button type="button" className="link-btn" onClick={() => ref.current?.close()}>Fechar</button>
        </div>
        {guide.description && <p>{guide.description}</p>}
        <div className="table-wrap">
          <table>
            <thead><tr>{guide.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
            <tbody>
              {guide.rows.map((r, i) => (
                <tr key={i}>{r.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}</tr>
              ))}
            </tbody>
          </table>
        </div>
        {guide.notes && <p className="muted">{guide.notes}</p>}
      </dialog>
    </>
  );
}
