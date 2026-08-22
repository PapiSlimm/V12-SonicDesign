import { Layer } from '../types';

export interface Command {
  execute(): void;
  undo(): void;
  label: string;
}

export class HistoryManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory = 100;

  public execute(command: Command) {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
  }

  public undo() {
    const command = this.undoStack.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
    }
  }

  public redo() {
    const command = this.redoStack.pop();
    if (command) {
      command.execute();
      this.undoStack.push(command);
    }
  }

  public canUndo() {
    return this.undoStack.length > 0;
  }

  public canRedo() {
    return this.redoStack.length > 0;
  }
}

// Commands
export class MoveLayerCommand implements Command {
  constructor(
    private layerId: string,
    private oldPos: { x: number; y: number },
    private newPos: { x: number; y: number },
    private updateFn: (id: string, pos: { x: number; y: number }) => void
  ) {}

  label = 'Move Layer';
  execute() { this.updateFn(this.layerId, this.newPos); }
  undo() { this.updateFn(this.layerId, this.oldPos); }
}

export class UpdateLayerCommand implements Command {
  constructor(
    private layerId: string,
    private oldData: Partial<Layer>,
    private newData: Partial<Layer>,
    private updateFn: (id: string, data: Partial<Layer>) => void
  ) {}

  label = 'Update Layer';
  execute() { this.updateFn(this.layerId, this.newData); }
  undo() { this.updateFn(this.layerId, this.oldData); }
}
