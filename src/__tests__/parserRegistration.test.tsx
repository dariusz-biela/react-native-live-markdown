import {expect} from '@jest/globals';
import React, {Activity, StrictMode, Suspense, act} from 'react';
import {createRoot} from 'react-dom/client';
import type {Root} from 'react-dom/client';
import type {MarkdownRange} from '../commonTypes';
import MarkdownTextInput from '../MarkdownTextInput';
import type {MarkdownTextInputProps} from '../MarkdownTextInput';

/**
 * The parser worklet lives in a C++ registry keyed by the `parserId` prop the decorator view carries. The registry is
 * replaced by a map of worklets here, the decorator view by an element that exposes its `parserId` as a DOM attribute, and
 * the native text input by a plain `<input>`, so the component renders in jsdom through `react-dom`.
 */
const liveParsers = new Map<number, MarkdownTextInputProps['parser']>();
let nextParserId = 1;

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

// The worklets babel plugin does not run under Jest, so the hash that marks a function as a worklet is attached by hand.
function createParserWorklet() {
  return Object.assign((): MarkdownRange[] => [], {__workletHash: 1});
}

const parser = createParserWorklet();

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
  const attribute = decorator?.getAttribute('data-parser-id');
  const parserId = Number(attribute);
  if (attribute == null || !Number.isInteger(parserId) || parserId < 0) {
    throw new Error('The decorator view rendered without a parser id');
  }
  return parserId;
}

function expectDecoratorOnTheOnlyLiveParserId(expectedParser: MarkdownTextInputProps['parser'] = parser) {
  expect(liveParsers.get(getDecoratorParserId())).toBe(expectedParser);
  expect(liveParsers.size).toBe(1);
}

describe('MarkdownTextInput parser registration', () => {
  beforeEach(() => {
    liveParsers.clear();
    nextParserId = 1;
    global.jsi_setMarkdownRuntime = jest.fn();
    global.jsi_registerMarkdownWorklet = (worklet) => {
      const parserId = nextParserId;
      nextParserId += 1;
      liveParsers.set(parserId, worklet as unknown as MarkdownTextInputProps['parser']);
      return parserId;
    };
    global.jsi_unregisterMarkdownWorklet = (parserId: number) => {
      liveParsers.delete(parserId);
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
    expect(liveParsers.size).toBe(0);
  });

  it('registers the parser once and publishes its id after mount', () => {
    renderIntoRoot(<MarkdownTextInput parser={parser} />);

    expect(nextParserId).toBe(2);
    expectDecoratorOnTheOnlyLiveParserId();
  });

  it('unregisters the parser on unmount', () => {
    renderIntoRoot(<MarkdownTextInput parser={parser} />);

    act(() => {
      root.unmount();
    });

    expect(liveParsers.size).toBe(0);
  });

  it('keeps the registration when rerendering with the same parser', () => {
    renderIntoRoot(<MarkdownTextInput parser={parser} />);
    const initialParserId = getDecoratorParserId();

    renderIntoRoot(
      <MarkdownTextInput
        parser={parser}
        value="*updated*"
      />,
    );

    expect(getDecoratorParserId()).toBe(initialParserId);
    expect(nextParserId).toBe(2);
    expectDecoratorOnTheOnlyLiveParserId();
  });

  it('does not register a parser for an Activity that is removed without ever becoming visible', () => {
    renderInActivity(true);

    expect(getDecoratorParserId()).toBe(0);
    expect(liveParsers.size).toBe(0);

    renderIntoRoot(<div />);

    expect(nextParserId).toBe(1);
    expect(liveParsers.size).toBe(0);
  });

  it('does not leak a registration when React abandons a suspended render', () => {
    const pending = new Promise<never>(() => {
      // Keep the subtree suspended until its render is abandoned.
    });
    function Suspend(): React.ReactNode {
      throw pending;
    }

    renderIntoRoot(
      <Suspense fallback={<span>Loading</span>}>
        <MarkdownTextInput parser={parser} />
        <Suspend />
      </Suspense>,
    );

    expect(container.textContent).toBe('Loading');
    expect(nextParserId).toBe(1);
    expect(liveParsers.size).toBe(0);

    renderIntoRoot(<MarkdownTextInput parser={parser} />);
    expectDecoratorOnTheOnlyLiveParserId();
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

  it('registers a replacement parser when a previously visible Activity is revealed', () => {
    renderInActivity(false);
    renderInActivity(true);
    expect(liveParsers.size).toBe(0);

    const nextParser = createParserWorklet();
    renderInActivity(true, nextParser);
    expect(liveParsers.size).toBe(0);

    renderInActivity(false, nextParser);
    expectDecoratorOnTheOnlyLiveParserId(nextParser);
  });

  it('keeps registrations independent for inputs sharing the same parser', () => {
    renderIntoRoot(
      <div>
        <MarkdownTextInput
          key="first"
          parser={parser}
        />
        <MarkdownTextInput
          key="second"
          parser={parser}
        />
      </div>,
    );
    const ids = Array.from(container.querySelectorAll('[data-parser-id]'), (element) => Number(element.getAttribute('data-parser-id')));
    expect(new Set(ids).size).toBe(2);
    expect(liveParsers.size).toBe(2);
    ids.forEach((id) => expect(liveParsers.get(id)).toBe(parser));

    renderIntoRoot(
      <div>
        <MarkdownTextInput
          key="second"
          parser={parser}
        />
      </div>,
    );
    expect(getDecoratorParserId()).toBe(ids[1]);
    expectDecoratorOnTheOnlyLiveParserId();
  });

  it('registers only the latest parser when an initially hidden <Activity> is revealed', () => {
    const nextParser = createParserWorklet();

    renderInActivity(true);
    expect(liveParsers.size).toBe(0);
    renderInActivity(true, nextParser);
    expect(liveParsers.size).toBe(0);
    renderInActivity(false, nextParser);

    expect(nextParserId).toBe(2);
    expectDecoratorOnTheOnlyLiveParserId(nextParser);
  });

  it('moves the decorator to a live id and drops the previous one when the parser changes identity', () => {
    renderIntoRoot(<MarkdownTextInput parser={parser} />);
    const initialParserId = getDecoratorParserId();

    const nextParser = createParserWorklet();
    renderIntoRoot(<MarkdownTextInput parser={nextParser} />);

    expect(getDecoratorParserId()).not.toBe(initialParserId);
    expectDecoratorOnTheOnlyLiveParserId(nextParser);
  });
});
