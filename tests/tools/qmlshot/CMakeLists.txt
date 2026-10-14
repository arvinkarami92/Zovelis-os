# SPDX-License-Identifier: GPL-3.0-or-later
cmake_minimum_required(VERSION 3.22)
project(qmlshot LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
find_package(Qt6 6.5 REQUIRED COMPONENTS Gui Qml Quick)
add_executable(qmlshot qmlshot.cpp)
target_link_libraries(qmlshot Qt6::Gui Qt6::Qml Qt6::Quick)
