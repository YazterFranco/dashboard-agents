/** Lluvia de estrellas al terminar algo. Es decoración: los lectores de pantalla no la leen. */
export function Celebration() {
  const pieces = ['⭐', '🎉', '✨', '🌟', '🎊', '⭐', '✨', '🌟'];
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={i} style={{ left: `${6 + i * 12}%`, animationDelay: `${(i % 4) * 0.15}s` }}>
          {p}
        </span>
      ))}
    </div>
  );
}
