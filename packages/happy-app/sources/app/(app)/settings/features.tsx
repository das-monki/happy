import { Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Item } from "@/components/Item";
import { ItemGroup } from "@/components/ItemGroup";
import { ItemList } from "@/components/ItemList";
import { useSettingMutable, useLocalSettingMutable } from "@/sync/storage";
import { Switch } from "@/components/Switch";
import { t } from "@/text";
import {
  useWhisperModelManager,
  WHISPER_MODELS,
} from "@/hooks/useWhisperModelManager";

export default function FeaturesSettingsScreen() {
  const [experiments, setExperiments] = useSettingMutable("experiments");
  const [agentInputEnterToSend, setAgentInputEnterToSend] = useSettingMutable(
    "agentInputEnterToSend",
  );
  const [commandPaletteEnabled, setCommandPaletteEnabled] =
    useLocalSettingMutable("commandPaletteEnabled");
  const [markdownCopyV2, setMarkdownCopyV2] =
    useLocalSettingMutable("markdownCopyV2");
  const [hideInactiveSessions, setHideInactiveSessions] = useSettingMutable(
    "hideInactiveSessions",
  );
  const [useEnhancedSessionWizard, setUseEnhancedSessionWizard] =
    useSettingMutable("useEnhancedSessionWizard");
  const [speechToTextEnabled, setSpeechToTextEnabled] = useSettingMutable(
    "speechToTextEnabled",
  );
  const [speechToTextModel, setSpeechToTextModel] =
    useSettingMutable("speechToTextModel");
  const modelManager = useWhisperModelManager();
  const [assistantAutoApprove, setAssistantAutoApprove] = useSettingMutable(
    "assistantAutoApprove",
  );

  return (
    <ItemList style={{ paddingTop: 0 }}>
      {/* Experimental Features */}
      <ItemGroup
        title={t("settingsFeatures.experiments")}
        footer={t("settingsFeatures.experimentsDescription")}
      >
        <Item
          title={t("settingsFeatures.experimentalFeatures")}
          subtitle={
            experiments
              ? t("settingsFeatures.experimentalFeaturesEnabled")
              : t("settingsFeatures.experimentalFeaturesDisabled")
          }
          icon={<Ionicons name="flask-outline" size={29} color="#5856D6" />}
          rightElement={
            <Switch value={experiments} onValueChange={setExperiments} />
          }
          showChevron={false}
        />
        <Item
          title={t("settingsFeatures.markdownCopyV2")}
          subtitle={t("settingsFeatures.markdownCopyV2Subtitle")}
          icon={<Ionicons name="text-outline" size={29} color="#34C759" />}
          rightElement={
            <Switch value={markdownCopyV2} onValueChange={setMarkdownCopyV2} />
          }
          showChevron={false}
        />
        <Item
          title={t("settingsFeatures.hideInactiveSessions")}
          subtitle={t("settingsFeatures.hideInactiveSessionsSubtitle")}
          icon={<Ionicons name="eye-off-outline" size={29} color="#FF9500" />}
          rightElement={
            <Switch
              value={hideInactiveSessions}
              onValueChange={setHideInactiveSessions}
            />
          }
          showChevron={false}
        />
        <Item
          title={t("settingsFeatures.enhancedSessionWizard")}
          subtitle={
            useEnhancedSessionWizard
              ? t("settingsFeatures.enhancedSessionWizardEnabled")
              : t("settingsFeatures.enhancedSessionWizardDisabled")
          }
          icon={<Ionicons name="sparkles-outline" size={29} color="#AF52DE" />}
          rightElement={
            <Switch
              value={useEnhancedSessionWizard}
              onValueChange={setUseEnhancedSessionWizard}
            />
          }
          showChevron={false}
        />
      </ItemGroup>

      {/* Speech to Text - iOS/Android only */}
      {Platform.OS !== "web" && (
        <ItemGroup
          title={t("settingsFeatures.speechToText")}
          footer={t("settingsFeatures.speechToTextDescription")}
        >
          <Item
            title={t("settingsFeatures.speechToText")}
            subtitle={
              speechToTextEnabled
                ? t("settingsFeatures.speechToTextEnabled")
                : t("settingsFeatures.speechToTextDisabled")
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
          {speechToTextEnabled &&
            WHISPER_MODELS.map((model) => {
              const status = modelManager.models.find((m) => m.id === model.id);
              const isSelected = speechToTextModel === model.id;
              const subtitle = status?.downloading
                ? t("settingsFeatures.speechToTextModelDownloading", {
                    progress: Math.round(status.progress * 100),
                  })
                : status?.ready
                  ? t("settingsFeatures.speechToTextModelReady")
                  : t("settingsFeatures.speechToTextModelNotDownloaded");

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

      {/* Web-only Features */}
      {Platform.OS === "web" && (
        <ItemGroup
          title={t("settingsFeatures.webFeatures")}
          footer={t("settingsFeatures.webFeaturesDescription")}
        >
          <Item
            title={t("settingsFeatures.enterToSend")}
            subtitle={
              agentInputEnterToSend
                ? t("settingsFeatures.enterToSendEnabled")
                : t("settingsFeatures.enterToSendDisabled")
            }
            icon={
              <Ionicons
                name="return-down-forward-outline"
                size={29}
                color="#007AFF"
              />
            }
            rightElement={
              <Switch
                value={agentInputEnterToSend}
                onValueChange={setAgentInputEnterToSend}
              />
            }
            showChevron={false}
          />
          <Item
            title={t("settingsFeatures.commandPalette")}
            subtitle={
              commandPaletteEnabled
                ? t("settingsFeatures.commandPaletteEnabled")
                : t("settingsFeatures.commandPaletteDisabled")
            }
            icon={<Ionicons name="keypad-outline" size={29} color="#007AFF" />}
            rightElement={
              <Switch
                value={commandPaletteEnabled}
                onValueChange={setCommandPaletteEnabled}
              />
            }
            showChevron={false}
          />
        </ItemGroup>
      )}
      {/* Assistant */}
      <ItemGroup
        title={t("settingsFeatures.assistant")}
        footer={t("settingsFeatures.assistantAutoApproveDescription")}
      >
        <Item
          title={t("settingsFeatures.assistantAutoApprove")}
          icon={
            <Ionicons
              name="shield-checkmark-outline"
              size={29}
              color="#34C759"
            />
          }
          rightElement={
            <Switch
              value={assistantAutoApprove}
              onValueChange={setAssistantAutoApprove}
            />
          }
          showChevron={false}
        />
      </ItemGroup>
    </ItemList>
  );
}
