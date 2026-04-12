window.GradientToolController = class GradientToolController {
  constructor(context) {
    this.context = context;
    this._startPoint = null;
  }

  activate() {
    this._cancel();
  }

  deactivate() {
    this._cancel();
  }

  pointerDown(point) {
    if (!point) return;

    this._startPoint = point;
    this.context.gradient.startPreview(point);
  }

  pointerMove(point) {
    if (!this._startPoint) return;

    this.context.gradient.updatePreview(this._startPoint, point);
  }

  pointerUp() {
    if (!this._startPoint) return false;

    const committed = this.context.gradient.commitPreview();
    this._startPoint = null;
    return committed;
  }

  _cancel() {
    this.context.gradient.cancelPreview();
    this._startPoint = null;
  }
};