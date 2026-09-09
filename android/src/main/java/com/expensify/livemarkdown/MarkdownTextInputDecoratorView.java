package com.expensify.livemarkdown;

import android.content.Context;
import android.text.Editable;
import android.text.SpannableStringBuilder;
import android.text.TextWatcher;

import android.view.View;

import com.facebook.react.bridge.ReactContext;
import com.facebook.react.views.textinput.ReactEditText;
import com.facebook.react.views.view.ReactViewGroup;

public class MarkdownTextInputDecoratorView extends ReactViewGroup {

  public MarkdownTextInputDecoratorView(Context context) {
    super(context);
    mMarkdownParser = new MarkdownParser((ReactContext) context);
  }

  private MarkdownStyle mMarkdownStyle;

  private int mParserId;

  // Owned by the view rather than by `mMarkdownUtils`, which is recreated every
  // time the view is attached, so the parser worklet stays alive for as long as
  // the view is mounted.
  private final MarkdownParser mMarkdownParser;

  private MarkdownUtils mMarkdownUtils;

  private ReactEditText mReactEditText;

  private TextWatcher mTextWatcher;

  @Override
  protected void onAttachedToWindow() {
    super.onAttachedToWindow();

    View child = getChildAt(0);
    if (child instanceof ReactEditText) {
      mMarkdownUtils = new MarkdownUtils((ReactContext) getContext(), mMarkdownParser);
      mMarkdownUtils.setMarkdownStyle(mMarkdownStyle);
      mMarkdownUtils.setParserId(mParserId);
      mReactEditText = (ReactEditText) child;
      mTextWatcher = new MarkdownTextWatcher(mMarkdownUtils);
      mReactEditText.addTextChangedListener(mTextWatcher);
      applyNewStyles();
    }
  }

  @Override
  protected void onDetachedFromWindow() {
    super.onDetachedFromWindow();
    if (mReactEditText != null) {
      mReactEditText.removeTextChangedListener(mTextWatcher);
      mReactEditText = null;
      mTextWatcher = null;
      mMarkdownUtils = null;
    }
  }

  protected void setMarkdownStyle(MarkdownStyle markdownStyle) {
    mMarkdownStyle = markdownStyle;
    if (mMarkdownUtils != null) {
      mMarkdownUtils.setMarkdownStyle(mMarkdownStyle);
    }
    applyNewStyles();
  }

  protected void setParserId(int parserId) {
    mParserId = parserId;
    mMarkdownParser.setParserId(parserId);
    if (mMarkdownUtils != null) {
      mMarkdownUtils.setParserId(mParserId);
    }
    applyNewStyles();
  }

  protected void applyNewStyles() {
    if (mReactEditText != null && mMarkdownUtils != null) {
      Editable editable = mReactEditText.getText();
      if (editable instanceof SpannableStringBuilder ssb) {
        mMarkdownUtils.applyMarkdownFormatting(ssb);
      }
    }
  }
}
