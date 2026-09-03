export interface ImeKeyboardEvent {
  isComposing: boolean;
  keyCode: number;
}

export function isImeInput(event: ImeKeyboardEvent, compositionActive: boolean): boolean {
  return compositionActive || event.isComposing || event.keyCode === 229;
}
