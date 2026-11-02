# A proposal worth questioning

This public, dependency-free exercise deliberately proposes the wrong change.
No actual AI service generated it. The video uses the equivalent built-in **Try demo** exercise.

Open this folder in VS Code, then run **Type the Change: Open a Plan** and choose
`plan.json`. Predict what `total([10, -5, 20])` should return before revealing the
proposal. Type a change yourself. Press **Ctrl+Alt+Enter / ⌘⌥Enter** and choose
**Check totals** the first time. The included VS Code task saves the reviewed
file and runs the check without opening the terminal. You can also run it manually:

```sh
node check.mjs
```

`return result` and `break` both lose the last price and return 10. `continue`
skips the negative price and returns 30. Compare the actual buffer and record
your reason for rejecting the proposal or keeping your own change. Rejecting
records your judgment; it does not undo, save, or repair your code.

The checker only exercises this one input. Try `[-5, 10, 20]`, `[]`, and other
cases before drawing broader conclusions. The extension runs the chosen task only after your explicit Save and Check action.
The video uses an isolated tutorial folder and keyboard controls.
