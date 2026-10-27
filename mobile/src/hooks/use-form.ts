// Field-by-field validation shared by every form: a field's error shows when the user leaves
// it (or presses submit) and updates live as they type once shown, so fixing it clears it.
import { useCallback, useState } from 'react';

type Validators<F extends string> = Record<F, (value: string, all: Record<F, string>) => string | undefined>;

export function useForm<F extends string>(initial: Record<F, string>, validators: Validators<F>) {
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState<Partial<Record<F, boolean>>>({});

  const errorOf = useCallback((field: F) => validators[field](values[field], values), [validators, values]);

  const errors = Object.fromEntries(
    (Object.keys(values) as F[]).map((f) => [f, touched[f] ? errorOf(f) : undefined]),
  ) as Partial<Record<F, string>>;

  const set = (field: F) => (text: string) => setValues((v) => ({ ...v, [field]: text }));
  const blur = (field: F) => () => setTouched((t) => ({ ...t, [field]: true }));

  /** Marks every field touched; true when the whole form is valid. */
  function validateAll(): boolean {
    setTouched(Object.fromEntries((Object.keys(values) as F[]).map((f) => [f, true])) as Record<F, boolean>);
    return (Object.keys(values) as F[]).every((f) => !errorOf(f));
  }

  return { values, errors, set, blur, validateAll };
}
