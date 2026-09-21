import React from 'react';
import FuelPanelBase from './FuelPanelBase.jsx';
import './FuelPanelV1034.css';

export default function FuelPanel(props) {
  const { showVehicleOverview = false } = props;
  return (
    <div className={showVehicleOverview ? 'fuelV1034DesktopShell' : 'fuelV1034Shell'}>
      <FuelPanelBase {...props} />
    </div>
  );
}
