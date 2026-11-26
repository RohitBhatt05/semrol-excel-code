Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\semrol-excel-code"
WshShell.Run """C:\nvm4w\nodejs\node.exe"" ""D:\semrol-excel-code\proxy.js""", 0, False
