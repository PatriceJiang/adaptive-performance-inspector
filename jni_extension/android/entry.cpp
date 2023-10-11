
#include "adpf_manager.h"
#include "bindings/sebind/sebind.h"
#include "cocos.h"
#include "engine/EngineEvents.h"
#include "plugins/Plugins.h"
#include "utils_bindings.h"


#include <mutex>

static std::once_flag initOnce;

// export c++ methods to JS
static bool register_utils(se::Object *ns) {  // NOLINT
    se::Value jsb;
    ns->getProperty("jsb", &jsb);
    jsb_register_thermalInfo(ns);
    jsb_register_udpUtils(ns);
    return true;
}

static void plugin_main() { // NOLINT
    static cc::events::ScriptEngine::Listener listener;
    listener.bind([](cc::ScriptEngineEvent event) {
        std::call_once(initOnce, []() {
            ADPFManager::getInstance().SetApplication();
        });

        if (event == cc::ScriptEngineEvent::AFTER_INIT) {
            se::ScriptEngine::getInstance()->addRegisterCallback(register_utils);
        }
    });
}

CC_PLUGIN_ENTRY(adaptive_performance_glue, plugin_main);
