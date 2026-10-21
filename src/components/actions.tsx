import React, { useState } from "react";
import { Alert } from "react-native";
import { useVault } from "../storage/vault";
import { Folder, VaultFile } from "../types";
import { countInside, plural } from "../utils";
import { openFile } from "../openFile";
import { FolderPicker } from "./FolderPicker";
import { ActionMenu, PromptModal } from "./ui";

/** Menu + rename + move + delete for one file. Render `element` once in the screen. */
export function useFileActions() {
  const vault = useVault();
  const [target, setTarget] = useState<VaultFile | null>(null);
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState(false);
  const [move, setMove] = useState(false);

  const element = (
    <>
      <ActionMenu
        visible={menu}
        title={target?.name}
        onClose={() => setMenu(false)}
        items={
          target
            ? [
                { label: "Open", icon: "external-link", onPress: () => openFile(vault.fileUri(target), target.mime) },
                {
                  label: "Share",
                  icon: "share-2",
                  onPress: () => vault.shareFile(target).catch(() => Alert.alert("Couldn't share this file")),
                },
                { label: "Rename", icon: "edit-2", onPress: () => setRename(true) },
                { label: "Move to another folder", icon: "corner-down-right", onPress: () => setMove(true) },
                {
                  label: "Delete",
                  icon: "trash-2",
                  danger: true,
                  onPress: () =>
                    Alert.alert(`Delete “${target.name}”?`, "This removes it from DocVault. It can't be undone.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => vault.deleteFile(target.id) },
                    ]),
                },
              ]
            : []
        }
      />
      <PromptModal
        visible={rename}
        title="Rename file"
        initial={target?.name}
        confirmLabel="Save"
        onCancel={() => setRename(false)}
        onSubmit={(v) => {
          if (target) vault.renameFile(target.id, v);
          setRename(false);
        }}
      />
      <FolderPicker
        visible={move}
        title="Move to"
        confirmLabel="Move to"
        disabledFolderId={target?.folderId}
        onClose={() => setMove(false)}
        onPick={(folderId) => {
          if (target) vault.moveFile(target.id, folderId);
          setMove(false);
        }}
      />
    </>
  );

  return {
    open: (f: VaultFile) => {
      setTarget(f);
      setMenu(true);
    },
    element,
  };
}

/** Menu + rename/colour + delete for one folder. */
export function useFolderActions(onDeleted?: () => void) {
  const vault = useVault();
  const [target, setTarget] = useState<Folder | null>(null);
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);

  const element = (
    <>
      <ActionMenu
        visible={menu}
        title={target?.name}
        onClose={() => setMenu(false)}
        items={
          target
            ? [
                { label: "Rename or change color", icon: "edit-2", onPress: () => setEdit(true) },
                {
                  label: "Delete folder",
                  icon: "trash-2",
                  danger: true,
                  onPress: () => {
                    const n = countInside(vault.folders, vault.files, target.id);
                    const inside =
                      n.files || n.folders
                        ? `${plural(n.files, "file")} and ${plural(n.folders, "subfolder")} inside will be deleted too. `
                        : "";
                    Alert.alert(`Delete “${target.name}”?`, `${inside}This can't be undone.`, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: async () => {
                          await vault.deleteFolder(target.id);
                          onDeleted?.();
                        },
                      },
                    ]);
                  },
                },
              ]
            : []
        }
      />
      <PromptModal
        visible={edit}
        title="Edit folder"
        initial={target?.name}
        initialColor={target?.color}
        withColor
        confirmLabel="Save"
        onCancel={() => setEdit(false)}
        onSubmit={(name, color) => {
          if (target) vault.updateFolder(target.id, { name, color });
          setEdit(false);
        }}
      />
    </>
  );

  return {
    open: (f: Folder) => {
      setTarget(f);
      setMenu(true);
    },
    element,
  };
}
