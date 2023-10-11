


add_library(adaptive_performance_glue
    ${CMAKE_CURRENT_LIST_DIR}/adpf_manager.cpp
    ${CMAKE_CURRENT_LIST_DIR}/adpf_manager.h
    ${CMAKE_CURRENT_LIST_DIR}/entry.cpp
    ${CMAKE_CURRENT_LIST_DIR}/utils_bindings.cpp
    ${CMAKE_CURRENT_LIST_DIR}/utils_bindings.h
)

target_link_libraries(adaptive_performance_glue
    adaptive_performance
    ${ENGINE_NAME} # cocos_engine
)

target_include_directories(adaptive_performance_glue PRIVATE
    ${_adaptive_performance_glue_SRC_DIR}/../include
)