import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FuelPanelBase from './FuelPanelBase.jsx';
import { deleteFuelEntry, loadFuelModuleData } from '../../modules/fuel.js';

export default function FuelPanel(props) {
  const {
    supabase,
    isAdmin,
    showVehicleOverview = false,
    logDiagnostic = () => {},
  } = props;
  const shellRef = useRef(null);
  const [portalTarget, setPortalTarget] = useState(null);
  const [revision, setRevision] = useState(0);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    if (showVehicleOverview || !isAdmin) {
      setPortalTarget(null);
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const shell = shellRef.current;
      if (!shell) return;
      const fuelModule = shell.querySelector('.fuelModule');
      const header = shell.querySelector('.fuelModuleHeader');
      const historyHeading = shell.querySelector('.fuelHistory .fuelCardHeading');
      fuelModule?.classList.add('fuelModuleCompactMobile');
      header?.classList.add('fuelModuleHeaderMobile');
      historyHeading?.classList.add('fuelHistoryHeading');
      const title = header?.querySelector('h2');
      if (title) title.textContent = 'Paliwo';
      setPortalTarget(historyHeading || null);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isAdmin, revision, showVehicleOverview]);

  async function handleDeleteAllEntries() {
    if (!isAdmin || bulkBusy) return;
    setBulkBusy(true);
    try {
      const data = await loadFuelModuleData({ supabase, isAdmin, entryLimit: 1000 });
      const entries = Array.isArray(data?.entries) ? data.entries : [];
      if (!entries.length) {
        setPortalTarget(null);
        setRevision((current) => current + 1);
        return;
      }
      const confirmed = window.confirm(`Usunąć wszystkie tankowania (${entries.length})? Tej operacji nie można cofnąć.`);
      if (!confirmed) return;

      let photoDeleteErrors = 0;
      for (const entry of entries) {
        const result = await deleteFuelEntry({
          supabase,
          isAdmin,
          entryId: entry.id,
          photoPath: entry.odometer_photo_path,
        });
        if (result?.photoDeleteError) {
          photoDeleteErrors += 1;
          logDiagnostic('fuel.photo.delete.failed', {
            module: 'fuel',
            fuelEntryId: entry.id,
            error: result.photoDeleteError,
          });
        }
      }

      logDiagnostic('fuel.delete-all.completed', {
        module: 'fuel',
        count: entries.length,
        photoDeleteErrors,
      });
      setPortalTarget(null);
      setRevision((current) => current + 1);
    } catch (error) {
      logDiagnostic('fuel.delete-all.failed', { module: 'fuel', error });
      window.alert(error?.message || 'Nie udało się usunąć wszystkich tankowań.');
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div ref={shellRef} className={showVehicleOverview ? 'fuelV1031DesktopShell' : 'fuelV1031Shell'}>
      <FuelPanelBase key={revision} {...props} />
      {!showVehicleOverview && isAdmin && portalTarget
        ? createPortal(
          <button
            type="button"
            className="fuelClearAllButton"
            onClick={() => void handleDeleteAllEntries()}
            disabled={bulkBusy}
            aria-label="Usuń wszystkie tankowania"
          >
            Usuń
          </button>,
          portalTarget,
        )
        : null}
    </div>
  );
}
