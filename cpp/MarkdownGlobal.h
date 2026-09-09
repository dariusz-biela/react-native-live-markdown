#pragma once

#include <jsi/jsi.h>

#include <worklets/WorkletRuntime/WorkletRuntime.h>

using namespace facebook;
using namespace worklets;

namespace expensify {
namespace livemarkdown {

void setMarkdownRuntime(const std::shared_ptr<WorkletRuntime> &markdownWorkletRuntime);

std::shared_ptr<WorkletRuntime> getMarkdownRuntime();

const int registerMarkdownWorklet(const std::shared_ptr<SerializableWorklet> &markdownWorklet);

void unregisterMarkdownWorklet(const int parserId);

// Returns nullptr when nothing is registered under `parserId`. Callers keep the
// result: JS drops the entry when React cleans up effects, which also happens
// for an input that is hidden but still mounted.
std::shared_ptr<SerializableWorklet> findMarkdownWorklet(const int parserId);

} // namespace livemarkdown
} // namespace expensify
