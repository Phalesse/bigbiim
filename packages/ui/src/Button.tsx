import type { ButtonHTMLAttributes } from 'react';

/** Composant de départ du paquet ui. Pas encore utilisé par les apps : à brancher quand vous le déciderez. */
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} />;
}
