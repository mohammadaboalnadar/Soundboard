Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Run from the project folder so npm can find package.json.
shell.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)

' 0 = hidden window, False = do not wait.
shell.Run "cmd /c npm start", 0, False
