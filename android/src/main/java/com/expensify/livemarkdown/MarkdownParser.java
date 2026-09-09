package com.expensify.livemarkdown;

import androidx.annotation.NonNull;

import com.facebook.jni.HybridData;
import com.facebook.jni.annotations.DoNotStrip;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.util.RNLog;
import com.facebook.soloader.SoLoader;
import com.facebook.systrace.Systrace;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Collections;
import java.util.LinkedList;
import java.util.List;

public class MarkdownParser {
  static {
    SoLoader.loadLibrary("livemarkdown");
  }

  @DoNotStrip
  @SuppressWarnings("unused")
  private final HybridData mHybridData;

  private final @NonNull ReactContext mReactContext;
  private String mPrevText;
  private int mPrevParserId;
  private List<MarkdownRange> mPrevMarkdownRanges;

  public MarkdownParser(@NonNull ReactContext reactContext) {
    mReactContext = reactContext;
    mHybridData = initHybrid();
  }

  private static native HybridData initHybrid();

  private native void nativeSetParserId(int parserId);

  private native String nativeParse(@NonNull String text, int parserId);

  /**
   * Keeps the worklet registered under {@code parserId} alive in native code for as long as this parser lives, so a
   * later parse still works after JS has unregistered the id. See {@code MarkdownParser.h} for why that happens.
   */
  public synchronized void setParserId(int parserId) {
    nativeSetParserId(parserId);
  }

  public synchronized List<MarkdownRange> parse(@NonNull String text, int parserId) {
    try {
      Systrace.beginSection(0, "parse");

      if (text.equals(mPrevText) && parserId == mPrevParserId) {
        return mPrevMarkdownRanges;
      }

      String json;
      try {
        Systrace.beginSection(0, "nativeParse");
        json = nativeParse(text, parserId);
      } catch (Exception e) {
        // Skip formatting, runGuarded will show the error in LogBox
        mPrevText = text;
        mPrevParserId = parserId;
        mPrevMarkdownRanges = Collections.emptyList();
        return mPrevMarkdownRanges;
      } finally {
        Systrace.endSection(0);
      }

      List<MarkdownRange> markdownRanges = new LinkedList<>();
      try {
        Systrace.beginSection(0, "markdownRanges");
        JSONArray ranges = new JSONArray(json);
        for (int i = 0; i < ranges.length(); i++) {
          JSONObject range = ranges.getJSONObject(i);
          String type = range.getString("type");
          int start = range.getInt("start");
          int length = range.getInt("length");
          int depth = range.optInt("depth", 1);
          if (length == 0 || start + length > text.length()) {
            continue;
          }
          markdownRanges.add(new MarkdownRange(type, start, length, depth));
        }
      } catch (JSONException e) {
        RNLog.w(mReactContext, "[react-native-live-markdown] Incorrect schema of worklet parser output: " + e.getMessage());
        mPrevText = text;
        mPrevParserId = parserId;
        mPrevMarkdownRanges = Collections.emptyList();
        return mPrevMarkdownRanges;
      } finally {
        Systrace.endSection(0);
      }

      mPrevText = text;
      mPrevParserId = parserId;
      mPrevMarkdownRanges = markdownRanges;
      return mPrevMarkdownRanges;
    } finally {
      Systrace.endSection(0);
    }
  }
}
