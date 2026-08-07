import React from 'react';
import GeneratorSidebar from '../components/GeneratorSidebar';
import VariationsGrid from '../components/VariationsGrid';
import AudioModal from '../components/AudioModal';
import { useAccount } from '../contexts/AccountContext';
import { useGenerator } from '../hooks/useGenerator';

const GeneratorPage: React.FC = () => {
  const { selectedAccount } = useAccount();
  const gen = useGenerator();

  return (
    <>
      <div className="flex flex-col">
        <GeneratorSidebar
          videoUrl={gen.videoUrl}
          activeTab={gen.activeTab}
          setActiveTab={gen.setActiveTab}
          inputText={gen.inputText}
          setInputText={gen.setInputText}
          variationCount={gen.variationCount}
          setVariationCount={gen.setVariationCount}
          tone={gen.tone}
          setTone={gen.setTone}
          ctaType={gen.ctaType}
          setCtaType={gen.setCtaType}
          isGenerating={gen.isGenerating}
          isGeneratingTopic={gen.isGeneratingTopic}
          progressMsg={gen.progressMsg}
          allLeadMagnets={gen.allLeadMagnets}
          selectedLeadMagnetId={gen.selectedLeadMagnetId}
          selectedAccountId={selectedAccount?.id ?? null}
          fileInputRef={gen.fileInputRef}
          onFileChange={gen.handleFileChange}
          onRandomTopic={gen.handleRandomTopic}
          onGenerate={gen.handleGenerate}
          onSelectLeadMagnet={gen.handleSelectLeadMagnet}
          getAvailableLeadMagnets={gen.getAvailableLeadMagnets}
          templates={gen.templates}
          selectedTemplateId={gen.selectedTemplateId}
          onTemplateSelect={gen.handleTemplateSelect}
        />

        <VariationsGrid
          appState={gen.appState}
          videoUrl={gen.videoUrl}
          variations={gen.variations}
          activeEditorTab={gen.activeEditorTab}
          setActiveEditorTab={gen.setActiveEditorTab}
          savingId={gen.savingId}
          onUpdateStyle={gen.updateStyle}
          onUpdatePosition={gen.updatePosition}
          onRemove={gen.removeVariation}
          onSave={(id) => gen.setShowAudioModal(id)}
          onReset={gen.handleReset}
        />
      </div>

      {gen.showAudioModal && (
        <AudioModal
          audioFiles={gen.audioFiles}
          onSelectAudio={(audioId) => {
            const variation = gen.variations.find(v => v.id === gen.showAudioModal);
            if (variation) gen.saveToScheduler(variation, audioId);
          }}
          onClose={() => gen.setShowAudioModal(null)}
        />
      )}
    </>
  );
};

export default GeneratorPage;
