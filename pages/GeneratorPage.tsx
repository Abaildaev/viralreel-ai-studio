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
          inputText={gen.inputText}
          setInputText={gen.setInputText}
          variationCount={gen.variationCount}
          setVariationCount={gen.setVariationCount}
          outputMode={gen.outputMode}
          setOutputMode={gen.setOutputMode}
          isGenerating={gen.isGenerating}
          progressMsg={gen.progressMsg}
          allLeadMagnets={gen.allLeadMagnets}
          selectedLeadMagnetId={gen.selectedLeadMagnetId}
          selectedAccountId={selectedAccount?.id ?? null}
          fileInputRef={gen.fileInputRef}
          onFileChange={gen.handleFileChange}
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
          onSelectAudio={(audioId, audioStartOffset) => {
            const variation = gen.variations.find(v => v.id === gen.showAudioModal);
            if (variation) gen.saveToScheduler(variation, audioId, audioStartOffset);
          }}
          onClose={() => gen.setShowAudioModal(null)}
        />
      )}
    </>
  );
};

export default GeneratorPage;
