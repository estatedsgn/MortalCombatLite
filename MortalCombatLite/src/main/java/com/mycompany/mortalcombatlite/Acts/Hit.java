/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.mycompany.mortalcombatlite.Acts;

/**
 *
 * @author nyaku
 */

import com.mycompany.mortalcombatlite.Heros.Hero;

public class Hit extends Act {

    @Override
    public String getType() {
        return "Hit";
    }

    @Override
    public void realisation(Hero hero1, Hero hero2, String hero2ActionType) {
        switch (hero2ActionType) {
            case "Hit" -> {
                if (hero2.isDebuffed() & hero1.isDebuffed()) {
                    hero2.setHealth((int) (-hero1.getDamage() * 1.25 / 2) + hero2.getHealth());
                }
                if (hero2.isDebuffed() & !hero1.isDebuffed()) {
                    hero2.setHealth((int) (-hero1.getDamage() * 1.25) + hero2.getHealth());
                }
                if (!hero2.isDebuffed() & hero1.isDebuffed()) {
                    hero2.setHealth((int) (-hero1.getDamage() / 2) + hero2.getHealth());
                }
                if (!hero2.isDebuffed() & !hero1.isDebuffed()) {
                    hero2.setHealth((int) (-hero1.getDamage()) + hero2.getHealth());
                }
            }
            case "Block" -> {
                hero1.setHealth(-hero2.getDamage() / 2 + hero1.getHealth());
            }
            case "Debuff" -> {
                hero2.setHealth((int) (-hero1.getDamage() * 1.15) + hero2.getHealth());
            }
            case "Heal" -> {
                hero2.setHealth(-hero1.getDamage() * 2 + hero2.getHealth());
            }
        }
    }
}
