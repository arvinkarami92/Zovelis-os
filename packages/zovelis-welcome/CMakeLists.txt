# SPDX-License-Identifier: GPL-3.0-or-later
# Zovelis Welcome — first-run setup and live-session welcome for Zovelis OS.
cmake_minimum_required(VERSION 3.22)
project(zovelis-welcome VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(GNUInstallDirs)
option(BUILD_TESTING "Build the unit and UI smoke tests" ON)

find_package(Qt6 6.5 REQUIRED COMPONENTS Core Gui Widgets Qml Quick QuickControls2)
qt_standard_project_setup(REQUIRES 6.5)

# Pure parsing helpers, shared with the unit tests.
add_library(zovelis_welcome_logic STATIC
    src/colorscheme.cpp
    src/colorscheme.h
    src/configfiles.cpp
    src/configfiles.h
)
target_include_directories(zovelis_welcome_logic PUBLIC src)
target_link_libraries(zovelis_welcome_logic PUBLIC Qt6::Core Qt6::Gui)
target_compile_definitions(zovelis_welcome_logic PUBLIC QT_NO_CAST_FROM_ASCII QT_NO_URL_CAST_FROM_STRING)

qt_add_executable(zovelis-welcome
    src/main.cpp
    src/backend.cpp
    src/backend.h
    src/iconprovider.cpp
    src/iconprovider.h
)
target_compile_definitions(zovelis-welcome PRIVATE
    ZOVELIS_WELCOME_VERSION="${PROJECT_VERSION}"
    ZOVELIS_LIBEXECDIR="${CMAKE_INSTALL_FULL_LIBEXECDIR}"
)
target_link_libraries(zovelis-welcome PRIVATE
    zovelis_welcome_logic Qt6::Gui Qt6::Widgets Qt6::Qml Qt6::Quick Qt6::QuickControls2)

set_source_files_properties(qml/components/Theme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
qt_add_qml_module(zovelis-welcome
    URI org.zovelis.welcome
    VERSION 1.0
    QML_FILES
        qml/Main.qml
        qml/components/AppTile.qml
        qml/components/ChoiceCard.qml
        qml/components/PageScaffold.qml
        qml/components/StatusCard.qml
        qml/components/StepIndicator.qml
        qml/components/Theme.qml
        qml/components/ThemePreview.qml
        qml/pages/AppearancePage.qml
        qml/pages/AppsPage.qml
        qml/pages/DonePage.qml
        qml/pages/LivePage.qml
        qml/pages/SecurityPage.qml
        qml/pages/WelcomePage.qml
    RESOURCES
        images/zovelis-mark.svg
)

install(TARGETS zovelis-welcome RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
install(PROGRAMS helper/zovelis-admin-helper DESTINATION ${CMAKE_INSTALL_LIBEXECDIR}/zovelis)
install(FILES data/org.zovelis.admin-helper.policy DESTINATION ${CMAKE_INSTALL_DATADIR}/polkit-1/actions)
install(FILES data/org.zovelis.Welcome.desktop DESTINATION ${CMAKE_INSTALL_DATADIR}/applications)
install(FILES data/org.zovelis.Welcome.metainfo.xml DESTINATION ${CMAKE_INSTALL_DATADIR}/metainfo)
install(FILES data/org.zovelis.Welcome-autostart.desktop
        DESTINATION ${CMAKE_INSTALL_FULL_SYSCONFDIR}/xdg/autostart
        RENAME org.zovelis.Welcome.desktop)

if(BUILD_TESTING)
    enable_testing()
    find_package(Qt6 REQUIRED COMPONENTS Test)
    add_subdirectory(tests)
endif()
