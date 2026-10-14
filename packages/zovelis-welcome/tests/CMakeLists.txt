# SPDX-License-Identifier: GPL-3.0-or-later
qt_add_executable(test_configfiles test_configfiles.cpp)
target_link_libraries(test_configfiles PRIVATE zovelis_welcome_logic Qt6::Gui Qt6::Test)
add_test(NAME configfiles COMMAND test_configfiles)
set_tests_properties(configfiles PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")

# Privileged helper: argument validation and file output, against a temp dir.
add_test(NAME admin-helper
         COMMAND sh ${CMAKE_CURRENT_SOURCE_DIR}/test-admin-helper.sh ${PROJECT_SOURCE_DIR}/helper/zovelis-admin-helper)

# Render every page in both modes and fail on any QML warning.
add_test(NAME ui-smoke
         COMMAND sh ${CMAKE_CURRENT_SOURCE_DIR}/ui-smoke.sh $<TARGET_FILE:zovelis-welcome>
                 ${CMAKE_CURRENT_BINARY_DIR}/screenshots ${CMAKE_CURRENT_SOURCE_DIR}/fixtures)
set_tests_properties(ui-smoke PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
