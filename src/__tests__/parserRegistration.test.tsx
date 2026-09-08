import {expect} from '@jest/globals';
import React, {Activity, StrictMode, act} from 'react';
import {createRoot} from 'react-dom/client';
import type {Root} from 'react-dom/client';
import type {MarkdownRange} from '../commonTypes';
import MarkdownTextInput from '../MarkdownTextInput';
import type {MarkdownTextInputProps} from '../MarkdownTextInput';

/**
 * The parser worklet lives in a C++ registry keyed by the `parserId` prop the decorator view carries. The registry is
 * replaced by a set of ids here, the decorator view by an element that exposes its `parserId` as a DOM attribute, and
 * the native text input by a plain `<input>`, so the component renders in jsdom through `react-dom`.
 */
const liveParserIds = new Set<number>();
let nextParserId = 1;
let registerCallCount = 0;

jest.mock('react-native', () => ({
  Platform: {OS: 'ios', select: (options: {ios?: unknown; default?: unknown}) => options.ios ?? options.default},
  StyleSheet: {create: <T,>(styles: T) => styles},
  TextInput: (props: {testID?: string}) => <input data-testid={props.testID} />,
  TurboModuleRegistry: {get: () => null},
  processColor: (color: unknown) => color,
}));

jest.mock('react-native-worklets', () => ({
  createSerializable: (worklet: unknown) => worklet,
  createWorkletRuntime: () => ({}),
}));

jest.mock('../MarkdownTextInputDecoratorViewNativeComponent', () => ({
  __esModule: true,
  default: (props: {parserId: number; children: React.ReactNode}) => <div data-parser-id={props.parserId}>{props.children}</div>,
}));

// The component refuses a parser that is not a worklet, and the worklets babel plugin does not run under Jest, so the
// hash that marks a function as a worklet is attached by hand.
function createParserWorklet(workletHash: number) {
  return Object.assign((): MarkdownRange[] => [], {__workletHash: workletHash});
}

const parser = createParserWorklet(1);

let container: HTMLDivElement;
let root: Root;

function renderIntoRoot(element: React.ReactElement) {
  act(() => {
    root.render(element);
  });
}

function renderInActivity(isHidden: boolean, currentParser: MarkdownTextInputProps['parser'] = parser) {
  renderIntoRoot(
    <Activity mode={isHidden ? 'hidden' : 'visible'}>
      <MarkdownTextInput parser={currentParser} />
    </Activity>,
  );
}

function getDecoratorParserId(): number {
  const decorator = container.querySelector('[data-parser-id]');
  const parserId = Number(decorator?.getAttribute('data-parser-id'));
  if (!Number.isInteger(parserId)) {
    throw new Error('The decorator view rendered without a parser id');
  }
  return parserId;
}

function expectDecoratorOnTheOnlyLiveParserId() {
  expect(liveParserIds.has(getDecoratorParserId())).toBe(true);
  expect(liveParserIds.size).toBe(1);
}

describe('MarkdownTextInput parser registration', () => {
  beforeEach(() => {
    liveParserIds.clear();
    nextParserId = 1;
    registerCallCount = 0;
    global.jsi_setMarkdownRuntime = jest.fn();
    global.jsi_registerMarkdownWorklet = () => {
      const parserId = nextParserId;
      nextParserId += 1;
      registerCallCount += 1;
      liveParserIds.add(parserId);
      return parserId;
    };
    global.jsi_unregisterMarkdownWorklet = (parserId: number) => {
      liveParserIds.delete(parserId);
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('registers the parser once and renders its id on mount', () => {
    renderIntoRoot(<MarkdownTextInput parser={parser} />);

    expect(registerCallCount).toBe(1);
    expectDecoratorOnTheOnlyLiveParserId();
  });

  it('unregisters the parser on unmount', () => {
    renderIntoRoot(<MarkdownTextInput parser={parser} />);

    act(() => {
      root.unmount();
    });

    expect(liveParserIds.size).toBe(0);
  });

  it('keeps the decorator on a live id under StrictMode', () => {
    renderIntoRoot(
      <StrictMode>
        <MarkdownTextInput parser={parser} />
      </StrictMode>,
    );

    expectDecoratorOnTheOnlyLiveParserId();
  });

  it('keeps the decorator on a live id after a hidden <Activity> is revealed', () => {
    renderInActivity(false);
    expectDecoratorOnTheOnlyLiveParserId();

    renderInActivity(true);
    renderInActivity(false);
    expectDecoratorOnTheOnlyLiveParserId();

    renderInActivity(true);
    renderInActivity(false);
    expectDecoratorOnTheOnlyLiveParserId();
  });

  it('drops the initial registration when the parser changes identity inside a hidden <Activity>', () => {
    const nextParser = createParserWorklet(2);

    renderInActivity(true);
    renderInActivity(true, nextParser);
    renderInActivity(false, nextParser);

    expectDecoratorOnTheOnlyLiveParserId();
  });

  it('moves the decorator to a live id and drops the previous one when the parser changes identity', () => {
    renderIntoRoot(<MarkdownTextInput parser={parser} />);
    const initialParserId = getDecoratorParserId();

    renderIntoRoot(<MarkdownTextInput parser={createParserWorklet(2)} />);

    expect(getDecoratorParserId()).not.toBe(initialParserId);
    expectDecoratorOnTheOnlyLiveParserId();
  });
});
