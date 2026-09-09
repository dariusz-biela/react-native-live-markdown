/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

#pragma once

#include <fbjni/fbjni.h>
#include <jsi/jsi.h>

#include <worklets/WorkletRuntime/WorkletRuntime.h>

#include <memory>
#include <mutex>

using namespace facebook;
using namespace worklets;

namespace expensify {
namespace livemarkdown {

  class MarkdownParser : public jni::HybridClass<MarkdownParser> {
  public:
    static constexpr auto kJavaDescriptor =
        "Lcom/expensify/livemarkdown/MarkdownParser;";

    static jni::local_ref<jhybriddata> initHybrid(jni::alias_ref<jclass>);

    // Looks up the worklet registered under `parserId` and keeps it alive until
    // another registered id is set or this parser is released. JS unregisters
    // the id when React cleans up effects, which also happens for an input that
    // is hidden but still mounted, so the registry can't be asked again at
    // parse time. An id the registry doesn't know leaves the previous worklet
    // in place.
    void nativeSetParserId(const int parserId);

    jni::local_ref<jni::JString> nativeParse(
        jni::alias_ref<jni::JString> text,
        const int parserId);

    static void registerNatives();

  private:
    friend HybridBase;

    MarkdownParser() = default;

    std::shared_ptr<SerializableWorklet> workletForParserId(const int parserId);

    std::mutex mutex_;
    int parserId_ = 0;
    std::shared_ptr<SerializableWorklet> markdownWorklet_;
  };

} // namespace livemarkdown
} // namespace expensify
