# A proposal worth questioning

This public, dependency-free exercise deliberately proposes the wrong change.
No actual AI service generated it. It is also the fixture used in the usage video.

Open this folder in VS Code, then run **Type the Change: Open a Plan** and choose
`plan.json`. Predict what `total([10, -5, 20])` should return before revealing the
proposal. Type a change yourself and save it when ready to run it:

```sh
node check.mjs
```

`return result` and `break` both lose the last price and return 10. `continue`
skips the negative price and returns 30. Compare the actual buffer and record
your reason for rejecting the proposal or keeping your own change. Rejecting
records your judgment; it does not undo, save, or repair your code.

The checker only exercises this one input. Try `[-5, 10, 20]`, `[]`, and other
cases before drawing broader conclusions. The extension never runs this command
on your behalf. The video uses an isolated tutorial folder and saves explicitly.
