export function breakActions (strict, canDefer, passedPercent, deferPercent) {
  const active = passedPercent < 100
  return {
    postpone: active && canDefer && (!strict || passedPercent < deferPercent),
    skip: active && !strict
  }
}
