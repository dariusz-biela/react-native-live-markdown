#include "MarkdownParser.h"
#include "MarkdownGlobal.h"

#include <fbjni/fbjni.h>

using namespace facebook;

namespace expensify {
namespace livemarkdown {
  jni::local_ref<MarkdownParser::jhybriddata> MarkdownParser::initHybrid(jni::alias_ref<jclass>) {
    return makeCxxInstance();
  }

  void MarkdownParser::nativeSetParserId(const int parserId) {
    std::unique_lock<std::mutex> lock(mutex_);
    if (parserId_ == parserId) {
      return;
    }
    const auto markdownWorklet = findMarkdownWorklet(parserId);
    if (markdownWorklet == nullptr) {
      return;
    }
    parserId_ = parserId;
    markdownWorklet_ = markdownWorklet;
  }

  // A parse for the current id uses the worklet kept alive by `nativeSetParserId`.
  // Any other id is looked up in the registry the way it always was.
  std::shared_ptr<SerializableWorklet> MarkdownParser::workletForParserId(const int parserId) {
    {
      std::unique_lock<std::mutex> lock(mutex_);
      if (parserId_ == parserId) {
        return markdownWorklet_;
      }
    }

    return findMarkdownWorklet(parserId);
  }

  jni::local_ref<jni::JString> MarkdownParser::nativeParse(
      jni::alias_ref<jni::JString> text,
      const int parserId) {
    const auto markdownWorklet = workletForParserId(parserId);
    if (markdownWorklet == nullptr) {
      return jni::make_jstring("[]");
    }

    const auto markdownRuntime = getMarkdownRuntime();
    jsi::Runtime &rt = markdownRuntime->getJSIRuntime();

    const auto input = jsi::String::createFromUtf8(rt, text->toStdString());
    const auto output = markdownRuntime->runGuarded(markdownWorklet, input);

    const auto json = rt.global().getPropertyAsObject(rt, "JSON").getPropertyAsFunction(rt, "stringify").call(rt, output).asString(rt).utf8(rt);
    return jni::make_jstring(json);
  }

  void MarkdownParser::registerNatives() {
    registerHybrid({
        makeNativeMethod("initHybrid", MarkdownParser::initHybrid),
        makeNativeMethod("nativeSetParserId", MarkdownParser::nativeSetParserId),
        makeNativeMethod("nativeParse", MarkdownParser::nativeParse)});
  }

} // namespace livemarkdown
} // namespace expensify
