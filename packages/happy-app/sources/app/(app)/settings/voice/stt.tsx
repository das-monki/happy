import * as React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Item } from "@/components/Item";
import { ItemGroup } from "@/components/ItemGroup";
import { ItemList } from "@/components/ItemList";
import { Switch } from "@/components/Switch";
import { useSettingMutable } from "@/sync/storage";
import {
  useWhisperModelManager,
  WHISPER_MODELS,
} from "@/hooks/useWhisperModelManager";
import { t } from "@/text";

// Whisper supported languages (top ~10 + auto-detect)
const STT_LANGUAGES = [
  { code: "auto", label: () => t("settingsSTT.languageAuto") },
  { code: "en", label: () => t("settingsSTT.languageEn") },
  { code: "zh", label: () => t("settingsSTT.languageZh") },
  { code: "de", label: () => t("settingsSTT.languageDe") },
  { code: "es", label: () => t("settingsSTT.languageEs") },
  { code: "ru", label: () => t("settingsSTT.languageRu") },
  { code: "fr", label: () => t("settingsSTT.languageFr") },
  { code: "pt", label: () => t("settingsSTT.languagePt") },
  { code: "ja", label: () => t("settingsSTT.languageJa") },
  { code: "ko", label: () => t("settingsSTT.languageKo") },
  { code: "it", label: () => t("settingsSTT.languageIt") },
  { code: "pl", label: () => t("settingsSTT.languagePl") },
];

export default React.memo(function STTSettingsScreen() {
  const [speechToTextEnabled, setSpeechToTextEnabled] = useSettingMutable(
    "speechToTextEnabled",
  );
  const [speechToTextModel, setSpeechToTextModel] =
    useSettingMutable("speechToTextModel");
  const [speechToTextLanguage, setSpeechToTextLanguage] = useSettingMutable(
    "speechToTextLanguage",
  );
  const modelManager = useWhisperModelManager();

  return (
    <ItemList style={{ paddingTop: 0 }}>
      {/* Enable toggle */}
      <ItemGroup
        title={t("settingsSTT.title")}
        footer={t("settingsSTT.description")}
      >
        <Item
          title={t("settingsSTT.title")}
          subtitle={
            speechToTextEnabled
              ? t("settingsSTT.enabled")
              : t("settingsSTT.disabled")
          }
          icon={<Ionicons name="mic-outline" size={29} color="#007AFF" />}
          rightElement={
            <Switch
              value={speechToTextEnabled}
              onValueChange={setSpeechToTextEnabled}
            />
          }
          showChevron={false}
        />
      </ItemGroup>

      {/* Language selector */}
      {speechToTextEnabled && (
        <ItemGroup title={t("settingsSTT.language")}>
          {STT_LANGUAGES.map((lang) => {
            const isSelected = speechToTextLanguage === lang.code;
            return (
              <Item
                key={lang.code}
                title={lang.label()}
                selected={isSelected}
                onPress={() => setSpeechToTextLanguage(lang.code)}
                rightElement={
                  isSelected ? (
                    <Ionicons name="checkmark" size={22} color="#007AFF" />
                  ) : undefined
                }
                showChevron={false}
              />
            );
          })}
        </ItemGroup>
      )}

      {/* Model selector */}
      {speechToTextEnabled && (
        <ItemGroup title={t("settingsSTT.model")}>
          {WHISPER_MODELS.map((model) => {
            const status = modelManager.models.find((m) => m.id === model.id);
            const isSelected = speechToTextModel === model.id;
            const subtitle = status?.downloading
              ? t("settingsSTT.modelDownloading", {
                  progress: Math.round(status.progress * 100),
                })
              : status?.ready
                ? t("settingsSTT.modelReady")
                : t("settingsSTT.modelNotDownloaded");

            return (
              <Item
                key={model.id}
                title={model.label}
                subtitle={`${model.size} — ${subtitle}`}
                selected={isSelected}
                onPress={() => setSpeechToTextModel(model.id)}
                rightElement={
                  isSelected ? (
                    <Ionicons name="checkmark" size={22} color="#007AFF" />
                  ) : undefined
                }
                showChevron={false}
              />
            );
          })}
        </ItemGroup>
      )}
    </ItemList>
  );
});
